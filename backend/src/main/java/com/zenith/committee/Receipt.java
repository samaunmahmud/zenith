package com.zenith.committee;

import com.zenith.agents.Prompts;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import tools.jackson.databind.MapperFeature;
import tools.jackson.databind.SerializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * A decision receipt: SHA-256 fingerprints of exactly what a ruling was made from and what it said.
 * <ul>
 *   <li>{@code factSheets}: the snapshot every agent was given (all the figures, computed in code)</li>
 *   <li>{@code ruling}: the analyst reports, rebuttals and the chair's decision</li>
 *   <li>{@code prompts}: each system prompt file, hashed byte for byte, so anyone with the repo can check them with
 *       {@code shasum -a 256 backend/src/main/resources/prompts/*.md}</li>
 *   <li>{@code models}: which Nemotron model held each seat</li>
 * </ul>
 * {@code id} fingerprints all four together. Re-hashing a saved run and comparing shows whether its figures or ruling
 * were changed after the meeting, and the prompt hashes show whether the prompts have changed since.
 */
public record Receipt(String id, String algorithm, String factSheets, String ruling, Map<String, String> prompts,
        Map<String, String> models) {

    /** Sorted keys and properties, so the same content always hashes the same, including after a save and reload. */
    private static final JsonMapper CANONICAL = JsonMapper.builder()
            .enable(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY)
            .enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS)
            .build();

    /** The receipt for a finished meeting (its receipt field is ignored). */
    public static Receipt issue(CommitteeResult r) {
        Map<String, String> prompts = new TreeMap<>();
        for (String name : Prompts.NAMES) prompts.put(name + ".md", Prompts.sha256(name));
        Map<String, String> models = new LinkedHashMap<>();
        if (r.agents() != null) r.agents().forEach(a -> models.put(a.id(), a.model()));
        String facts = sha256(canonical(r.snapshot()));
        String ruling = sha256(canonical(rulingOf(r)));
        String id = sha256(facts + "\n" + ruling + "\n" + canonical(prompts) + "\n" + canonical(models)).substring(0, 16);
        return new Receipt(id, "SHA-256", facts, ruling, prompts, models);
    }

    /** What re-hashing a saved run shows. {@code changedPrompts}: prompt files that differ from the ones in use now. */
    public record Check(boolean factSheetsMatch, boolean rulingMatches, boolean idMatches, List<String> changedPrompts) {
        public boolean intact() {
            return factSheetsMatch && rulingMatches && idMatches;
        }
    }

    public static Check verify(CommitteeResult saved) {
        Receipt stored = saved.receipt();
        Receipt now = issue(saved);
        // The id is recomputed from the stored prompt and model hashes: prompts edited since don't make an old run "tampered".
        String id = sha256(now.factSheets + "\n" + now.ruling + "\n" + canonical(stored.prompts) + "\n" + canonical(stored.models))
                .substring(0, 16);
        List<String> changed = now.prompts.entrySet().stream()
                .filter(e -> !e.getValue().equals(stored.prompts.get(e.getKey())))
                .map(Map.Entry::getKey)
                .toList();
        return new Check(now.factSheets.equals(stored.factSheets), now.ruling.equals(stored.ruling), id.equals(stored.id), changed);
    }

    private static Map<String, Object> rulingOf(CommitteeResult r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("reports", r.reports());
        m.put("rebuttals", r.rebuttals());
        m.put("decision", r.decision());
        return m;
    }

    private static String canonical(Object o) {
        return CANONICAL.writeValueAsString(o);
    }

    static String sha256(String s) {
        return sha256(s.getBytes(StandardCharsets.UTF_8));
    }

    public static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is always available", e);
        }
    }
}
