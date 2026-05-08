package com.agui.controller;

import com.agui.agent.TicketAgent;
import com.agui.model.RunAgentInput;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;

import java.util.Collection;

@RestController
@CrossOrigin(origins = "http://localhost:5173")
public class AgentController {

    private final TicketAgent agent;

    public AgentController(TicketAgent agent) {
        this.agent = agent;
    }

    @PostMapping(value = "/agent", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> agentEndpoint(@RequestBody RunAgentInput body) {
        return agent.run(body);
    }

    @GetMapping("/tickets")
    public Collection<?> listTickets() {
        return agent.tickets.values();
    }
}
