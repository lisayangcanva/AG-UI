package com.agui.model;

import java.util.List;

public record Ticket(
    String id,
    String type,
    String title,
    String description,
    String priority,
    List<String> labels
) {}
