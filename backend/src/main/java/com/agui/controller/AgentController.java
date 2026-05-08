package com.agui.controller;

import com.agui.agent.PrintAgent;
import com.agui.agent.TicketAgent;
import com.agui.model.RunAgentInput;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;

import java.util.Collection;

@RestController
@CrossOrigin(origins = "http://localhost:5173")
public class AgentController {

    private final TicketAgent ticketAgent;
    private final PrintAgent printAgent;

    public AgentController(TicketAgent ticketAgent, PrintAgent printAgent) {
        this.ticketAgent = ticketAgent;
        this.printAgent = printAgent;
    }

    @PostMapping(value = "/agent", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> agentEndpoint(@RequestBody RunAgentInput body) {
        return ticketAgent.run(body);
    }

    @PostMapping(value = "/print-agent", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> printAgentEndpoint(@RequestBody RunAgentInput body) {
        return printAgent.run(body);
    }

    @GetMapping("/tickets")
    public Collection<?> listTickets() {
        return ticketAgent.tickets.values();
    }
}
