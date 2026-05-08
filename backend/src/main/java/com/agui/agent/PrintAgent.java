package com.agui.agent;

import com.agui.model.RunAgentInput;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import com.openai.models.ChatModel;
import com.openai.models.chat.completions.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.FluxSink;

import java.util.*;

@Component
public class PrintAgent {

    private static final String SYSTEM_PROMPT = """
            You are a print issue specialist. The user has described a print problem.
            First write 2-3 sentences analysing what kind of print issue this is and what the likely root cause is.
            Then provide: (1) the most probable root cause, (2) step-by-step resolution instructions,
            and (3) one tip to prevent this issue recurring.
            Be concise and practical — assume the user is non-technical.""";

    private static final List<String> PROGRESS_STEPS = List.of(
            "Connecting to print spooler and detecting printer…",
            "Checking printer status and driver configuration…",
            "Scanning print queue for stuck jobs or conflicts…",
            "Analysing paper tray, ink/toner levels, and hardware…",
            "Diagnosing root cause and preparing resolution…"
    );

    private final OpenAIClient client;
    private final ObjectMapper mapper = new ObjectMapper();

    public PrintAgent(
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

        // Stream 5 progress steps, one per second
        for (int i = 0; i < PROGRESS_STEPS.size(); i++) {
            sink.next(sseEvent("STEP_PROGRESS", Map.of(
                    "step", i + 1,
                    "total", PROGRESS_STEPS.size(),
                    "message", PROGRESS_STEPS.get(i))));
            Thread.sleep(1000);
        }

        // Build messages for GPT
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
            }
        }

        ChatCompletionCreateParams params = ChatCompletionCreateParams.builder()
                .model(ChatModel.GPT_4_1)
                .maxTokens(512L)
                .messages(messages)
                .build();

        String msgId = UUID.randomUUID().toString();
        sink.next(sseEvent("TEXT_MESSAGE_START", Map.of("message_id", msgId, "role", "assistant")));

        try (var stream = client.chat().completions().createStreaming(params)) {
            stream.stream().forEach(chunk -> {
                if (chunk.choices().isEmpty()) return;
                chunk.choices().get(0).delta().content().ifPresent(text -> {
                    if (!text.isEmpty()) {
                        sink.next(sseEvent("TEXT_MESSAGE_CONTENT", Map.of(
                                "message_id", msgId, "delta", text)));
                    }
                });
            });
        }

        sink.next(sseEvent("TEXT_MESSAGE_END", Map.of("message_id", msgId)));
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
            return mapper.writeValueAsString(payload);
        } catch (Exception e) {
            return "{\"type\":\"RUN_ERROR\",\"message\":\"serialization error\"}";
        }
    }
}
