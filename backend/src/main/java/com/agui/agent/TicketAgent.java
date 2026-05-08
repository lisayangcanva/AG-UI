package com.agui.agent;

import com.agui.model.RunAgentInput;
import com.agui.model.Ticket;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import com.openai.core.JsonValue;
import com.openai.models.ChatModel;
import com.openai.models.FunctionDefinition;
import com.openai.models.FunctionParameters;
import com.openai.models.chat.completions.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.FluxSink;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class TicketAgent {

    private static final String SYSTEM_PROMPT = """
            You are a ticket creation agent. When the user describes a problem or request,
            you will create a well-structured ticket using the create_ticket function.
            For bugs: focus on what's broken, steps to reproduce, and expected vs actual behavior.
            For features: focus on the user value, acceptance criteria, and scope.
            For tasks: focus on the work to be done, definition of done, and any dependencies.
            Always call create_ticket — never just describe the ticket in text.""";

    public final Map<String, Ticket> tickets = new ConcurrentHashMap<>();

    private final OpenAIClient client;
    private final ObjectMapper mapper = new ObjectMapper();

    public TicketAgent(
            @Value("${openai.api-key}") String apiKey,
            @Value("${openai.org-id}") String orgId) {
        this.client = OpenAIOkHttpClient.builder()
                .apiKey(apiKey)
                .organization(orgId)
                .build();
    }

    public Flux<String> run(RunAgentInput input) {
        return Flux.create(sink -> {
            try {
                runAgent(input, sink);
            } catch (Exception e) {
                sink.next(sseEvent("RUN_ERROR", Map.of("message", e.getMessage())));
                sink.complete();
            }
        });
    }

    private void runAgent(RunAgentInput input, FluxSink<String> sink) throws Exception {
        sink.next(sseEvent("RUN_STARTED", Map.of(
                "thread_id", input.threadId(),
                "run_id", input.runId())));

        // Build message list, prepending the system message
        List<ChatCompletionMessageParam> messages = new ArrayList<>();
        messages.add(ChatCompletionMessageParam.ofSystem(
                ChatCompletionSystemMessageParam.builder()
                        .content(SYSTEM_PROMPT)
                        .build()));
        for (var m : input.messages()) {
            if ("user".equals(m.role())) {
                messages.add(ChatCompletionMessageParam.ofUser(
                        ChatCompletionUserMessageParam.builder()
                                .content(m.content())
                                .build()));
            } else {
                messages.add(ChatCompletionMessageParam.ofAssistant(
                        ChatCompletionAssistantMessageParam.builder()
                                .content(m.content())
                                .build()));
            }
        }

        ChatCompletionTool tool = buildCreateTicketTool();
        ChatCompletionCreateParams params = ChatCompletionCreateParams.builder()
                .model(ChatModel.GPT_4_1)
                .maxTokens(1024L)
                .tools(List.of(tool))
                .messages(messages)
                .build();

        String msgId = UUID.randomUUID().toString();
        sink.next(sseEvent("TEXT_MESSAGE_START", Map.of("message_id", msgId, "role", "assistant")));

        // Accumulate tool call fragments: index → {id, name, args}
        Map<Long, String[]> toolCallBuffers = new LinkedHashMap<>(); // index → [id, name, argsBuffer]

        // --- First streaming call ---
        try (var stream = client.chat().completions().createStreaming(params)) {
            stream.stream().forEach(chunk -> {
                if (chunk.choices().isEmpty()) return;
                var delta = chunk.choices().get(0).delta();

                // text delta
                delta.content().ifPresent(text -> {
                    if (!text.isEmpty()) {
                        sink.next(sseEvent("TEXT_MESSAGE_CONTENT", Map.of(
                                "message_id", msgId, "delta", text)));
                    }
                });

                // tool call deltas
                delta.toolCalls().ifPresent(toolCallDeltas -> {
                    for (var tc : toolCallDeltas) {
                        long idx = tc.index();
                        toolCallBuffers.computeIfAbsent(idx, k -> new String[]{"", "", ""});
                        String[] buf = toolCallBuffers.get(idx);

                        // id and name only arrive on the first chunk for this index
                        tc.id().ifPresent(id -> {
                            buf[0] = id;
                            buf[1] = tc.function().map(f -> f.name().orElse("")).orElse("");
                            sink.next(sseEvent("TOOL_CALL_START", Map.of(
                                    "tool_call_id", buf[0],
                                    "tool_call_name", buf[1],
                                    "parent_message_id", msgId)));
                        });

                        // arguments stream in as fragments
                        tc.function().ifPresent(fn -> fn.arguments().ifPresent(fragment -> {
                            buf[2] += fragment;
                            sink.next(sseEvent("TOOL_CALL_ARGS", Map.of(
                                    "tool_call_id", buf[0], "delta", fragment)));
                        }));
                    }
                });
            });
        }

        sink.next(sseEvent("TEXT_MESSAGE_END", Map.of("message_id", msgId)));

        // emit TOOL_CALL_END for each completed tool call
        for (var buf : toolCallBuffers.values()) {
            sink.next(sseEvent("TOOL_CALL_END", Map.of("tool_call_id", buf[0])));
        }

        // --- Execute tool calls ---
        List<ChatCompletionMessageToolCall> toolCallObjects = new ArrayList<>();
        for (var buf : toolCallBuffers.values()) {
            toolCallObjects.add(ChatCompletionMessageToolCall.builder()
                    .id(buf[0])
                    .function(ChatCompletionMessageToolCall.Function.builder()
                            .name(buf[1])
                            .arguments(buf[2])
                            .build())
                    .build());
        }

        List<ChatCompletionMessageParam> toolResultMessages = new ArrayList<>();
        for (var buf : toolCallBuffers.values()) {
            String resultJson;
            if ("create_ticket".equals(buf[1])) {
                JsonNode argsNode = mapper.readTree(buf[2].isBlank() ? "{}" : buf[2]);
                Ticket ticket = new Ticket(
                        "TKT-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(),
                        text(argsNode, "type", "task"),
                        text(argsNode, "title", ""),
                        text(argsNode, "description", ""),
                        text(argsNode, "priority", "medium"),
                        labels(argsNode));
                tickets.put(ticket.id(), ticket);
                resultJson = mapper.writeValueAsString(ticket);
            } else {
                resultJson = "{\"error\":\"Unknown tool: " + buf[1] + "\"}";
            }
            toolResultMessages.add(ChatCompletionMessageParam.ofTool(
                    ChatCompletionToolMessageParam.builder()
                            .toolCallId(buf[0])
                            .content(resultJson)
                            .build()));
        }

        sink.next(sseEvent("STATE_SNAPSHOT", Map.of(
                "snapshot", Map.of("tickets", tickets.values()))));

        // --- Second call: summarise ---
        if (!toolCallBuffers.isEmpty()) {
            List<ChatCompletionMessageParam> followUp = new ArrayList<>(messages);
            followUp.add(ChatCompletionMessageParam.ofAssistant(
                    ChatCompletionAssistantMessageParam.builder()
                            .toolCalls(toolCallObjects)
                            .build()));
            followUp.addAll(toolResultMessages);

            ChatCompletionCreateParams params2 = ChatCompletionCreateParams.builder()
                    .model(ChatModel.GPT_4_1)
                    .maxTokens(256L)
                    .tools(List.of(tool))
                    .messages(followUp)
                    .build();

            String summaryId = UUID.randomUUID().toString();
            sink.next(sseEvent("TEXT_MESSAGE_START", Map.of("message_id", summaryId, "role", "assistant")));

            try (var stream2 = client.chat().completions().createStreaming(params2)) {
                stream2.stream().forEach(chunk -> {
                    if (chunk.choices().isEmpty()) return;
                    chunk.choices().get(0).delta().content().ifPresent(text -> {
                        if (!text.isEmpty()) {
                            sink.next(sseEvent("TEXT_MESSAGE_CONTENT", Map.of(
                                    "message_id", summaryId, "delta", text)));
                        }
                    });
                });
            }

            sink.next(sseEvent("TEXT_MESSAGE_END", Map.of("message_id", summaryId)));
        }

        sink.next(sseEvent("RUN_FINISHED", Map.of(
                "thread_id", input.threadId(),
                "run_id", input.runId())));
        sink.complete();
    }

    private String sseEvent(String type, Map<String, Object> extra) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("type", type);
            payload.putAll(extra);
            return "data: " + mapper.writeValueAsString(payload) + "\n\n";
        } catch (Exception e) {
            return "data: {\"type\":\"RUN_ERROR\",\"message\":\"serialization error\"}\n\n";
        }
    }

    private ChatCompletionTool buildCreateTicketTool() {
        ObjectNode props = mapper.createObjectNode();
        addStringEnum(props, "type", "The ticket type", "bug", "feature", "task");
        addString(props, "title", "Short, actionable title (max 80 chars)");
        addString(props, "description", "Detailed description with context and acceptance criteria");
        addStringEnum(props, "priority", "Priority level", "low", "medium", "high", "critical");
        props.putObject("labels").put("type", "array").putObject("items").put("type", "string");

        FunctionParameters parameters = FunctionParameters.builder()
                .putAdditionalProperty("type", JsonValue.from("object"))
                .putAdditionalProperty("properties", JsonValue.fromJsonNode(props))
                .putAdditionalProperty("required", JsonValue.from(
                        List.of("type", "title", "description", "priority")))
                .build();

        return ChatCompletionTool.builder()
                .function(FunctionDefinition.builder()
                        .name("create_ticket")
                        .description("Creates a structured ticket in the system")
                        .parameters(parameters)
                        .build())
                .build();
    }

    private void addString(ObjectNode props, String name, String desc) {
        props.putObject(name).put("type", "string").put("description", desc);
    }

    private void addStringEnum(ObjectNode props, String name, String desc, String... values) {
        ObjectNode node = props.putObject(name);
        node.put("type", "string").put("description", desc);
        var en = node.putArray("enum");
        for (String v : values) en.add(v);
    }

    private String text(JsonNode node, String field, String def) {
        return node.has(field) ? node.get(field).asText(def) : def;
    }

    private List<String> labels(JsonNode node) {
        if (!node.has("labels") || !node.get("labels").isArray()) return List.of();
        List<String> result = new ArrayList<>();
        node.get("labels").forEach(n -> result.add(n.asText()));
        return result;
    }
}
