package com.zenith.api;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Clock;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * The public demo's front door, in one place:
 * <ul>
 *   <li><b>Security headers</b> on every response: a strict Content Security Policy (scripts only from this origin,
 *       plus the one inline theme script by its hash), no framing, no MIME sniffing, no referrer.</li>
 *   <li><b>No caching</b> of API responses by browsers or proxies.</li>
 *   <li><b>A body size cap</b> on API requests: the largest legitimate body is a 1,200-character thesis.</li>
 *   <li><b>A per-visitor rate limit</b> on the endpoints that can call Nemotron (and on search, which spends the FMP
 *       quota). The budget caps in CommitteeGate are global; this stops one visitor from using all of them.</li>
 * </ul>
 */
@Component
public class ApiSecurityFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(ApiSecurityFilter.class);

    /** SHA-256 of the inline script in frontend/index.html (ApiSecurityFilterTest fails if they drift apart). */
    static final String THEME_SCRIPT_HASH = "sha256-AwIOtA17lQLU3xNEAE1wsFGqec8UxZo7ortXDD4REAw=";

    static final String CSP = String.join("; ",
            "default-src 'self'",
            "script-src 'self' '" + THEME_SCRIPT_HASH + "'",
            "style-src 'self' 'unsafe-inline'", // React style props; no stylesheets from anywhere else
            "img-src 'self' data:",
            "font-src 'self' data:",
            "connect-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'");

    static final long MAX_BODY_BYTES = 16 * 1024;

    private final int paidPerWindow;
    private final int searchPerWindow;
    private final long windowMillis;
    private final Clock clock;
    private final Map<String, Deque<Long>> hits = new ConcurrentHashMap<>();

    @Autowired
    public ApiSecurityFilter(@Value("${zenith.rate-limit.paid-per-window:12}") int paidPerWindow,
            @Value("${zenith.rate-limit.search-per-window:60}") int searchPerWindow,
            @Value("${zenith.rate-limit.window-minutes:10}") int windowMinutes) {
        this(paidPerWindow, searchPerWindow, windowMinutes, Clock.systemUTC());
    }

    ApiSecurityFilter(int paidPerWindow, int searchPerWindow, int windowMinutes, Clock clock) {
        this.paidPerWindow = paidPerWindow;
        this.searchPerWindow = searchPerWindow;
        this.windowMillis = windowMinutes * 60_000L;
        this.clock = clock;
    }

    /** Which rate-limit bucket a request falls in, or null when it isn't limited (cheap, cache-only reads). */
    static String bucket(String method, String path) {
        if (path.equals("/api/committee") && method.equals("POST")) return "paid";
        if (path.equals("/api/committee/stream")) return "paid";
        if ((path.equals("/api/ask") || path.equals("/api/thesis")) && method.equals("POST")) return "paid";
        if (path.equals("/api/search")) return "search";
        return null;
    }

    /**
     * Who is asking. Behind the Nebius endpoint's proxy the socket address is the proxy, so the last
     * X-Forwarded-For entry (the one the proxy itself appended) identifies the visitor; earlier entries are whatever
     * the client claimed and can't be trusted.
     */
    static String clientOf(HttpServletRequest req) {
        String xff = req.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            String[] parts = xff.split(",");
            String last = parts[parts.length - 1].trim();
            if (!last.isEmpty()) return last;
        }
        return req.getRemoteAddr();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        res.setHeader("Content-Security-Policy", CSP);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Frame-Options", "DENY");
        res.setHeader("Referrer-Policy", "no-referrer");
        res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        if (req.isSecure() || "https".equalsIgnoreCase(req.getHeader("X-Forwarded-Proto"))) {
            res.setHeader("Strict-Transport-Security", "max-age=31536000");
        }

        String path = req.getRequestURI();
        if (!path.startsWith("/api/")) {
            chain.doFilter(req, res);
            return;
        }
        res.setHeader("Cache-Control", "no-store");

        if (!req.getMethod().equals("GET") && !req.getMethod().equals("HEAD")) {
            long length = req.getContentLengthLong();
            if (length < 0 && req.getHeader("Transfer-Encoding") != null) {
                reject(res, 411, "Send the request with a Content-Length.");
                return;
            }
            if (length > MAX_BODY_BYTES) {
                reject(res, 413, "Request body too large.");
                return;
            }
        }

        String bucket = bucket(req.getMethod(), path);
        if (bucket != null) {
            int limit = bucket.equals("paid") ? paidPerWindow : searchPerWindow;
            if (limit > 0 && !allow(bucket + "|" + clientOf(req), limit)) {
                log.info("Rate limited a visitor on {} ({} per {} min)", path, limit, windowMillis / 60_000);
                res.setHeader("Retry-After", String.valueOf(windowMillis / 1000));
                String message = "You're going faster than this public demo allows (" + limit + " requests per "
                        + windowMillis / 60_000 + " minutes). Please wait a few minutes.";
                if (path.equals("/api/committee/stream")) {
                    // The EventSource client reads errors as events, not HTTP statuses.
                    res.setStatus(200);
                    res.setContentType("text/event-stream");
                    res.getWriter().write("event:error\ndata:{\"type\":\"error\",\"message\":\"" + message + "\",\"status\":429}\n\n");
                    return;
                }
                reject(res, 429, message);
                return;
            }
        }
        chain.doFilter(req, res);
    }

    /** Sliding window per visitor and bucket. */
    boolean allow(String key, int limit) {
        long now = clock.millis();
        if (hits.size() > 10_000) hits.values().removeIf(d -> d.isEmpty() || d.peekLast() < now - windowMillis); // bound memory
        Deque<Long> times = hits.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (times) {
            while (!times.isEmpty() && times.peekFirst() <= now - windowMillis) times.pollFirst();
            if (times.size() >= limit) return false;
            times.addLast(now);
            return true;
        }
    }

    private static void reject(HttpServletResponse res, int status, String message) throws IOException {
        res.setStatus(status);
        res.setContentType("application/json");
        res.getWriter().write("{\"error\":\"" + message.replace("\"", "'") + "\"}");
    }
}
