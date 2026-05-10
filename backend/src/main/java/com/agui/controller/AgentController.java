package com.agui.controller;

import com.agui.agent.TicketAgent;
import com.agui.model.RunAgentInput;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;

import java.util.Collection;

@RestController
@CrossOrigin(origins = "http://localhost:5173")
public class AgentController {

    private final TicketAgent ticketAgent;

    public AgentController(TicketAgent ticketAgent) {
        this.ticketAgent = ticketAgent;
    }

    @PostMapping(value = "/agent", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<String>> agentEndpoint(@RequestBody RunAgentInput body) {
        return ticketAgent.run(body)
                .map(json -> ServerSentEvent.<String>builder().data(json).build());
    }

    @GetMapping("/tickets")
    public Collection<?> listTickets() {
        return ticketAgent.tickets.values();
    }
}
