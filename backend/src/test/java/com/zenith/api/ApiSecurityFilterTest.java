package com.zenith.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class ApiSecurityFilterTest {

    /** A clock the test moves by hand. */
    static final class TestClock extends Clock {
        Instant now = Instant.parse("2026-10-03T12:00:00Z");

        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    private static MockHttpServletResponse call(ApiSecurityFilter filter, MockHttpServletRequest req) throws Exception {
        var res = new MockHttpServletResponse();
        filter.doFilter(req, res, new MockFilterChain());
        return res;
    }

    private static MockHttpServletRequest post(String path, String ip) {
        var req = new MockHttpServletRequest("POST", path);
        req.setRemoteAddr(ip);
        req.setContentType("application/json");
        req.setContent("{\"ticker\":\"AAPL\"}".getBytes(StandardCharsets.UTF_8));
        return req;
    }

    @Test
    void cspHashMatchesTheInlineScriptInIndexHtml() throws Exception {
        String html = Files.readString(Path.of("../frontend/index.html"));
        Matcher m = Pattern.compile("<script>(.*?)</script>", Pattern.DOTALL).matcher(html);
        assertThat(m.find()).as("index.html has its inline theme script").isTrue();
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(m.group(1).getBytes(StandardCharsets.UTF_8));
        assertThat("sha256-" + Base64.getEncoder().encodeToString(digest))
                .as("update THEME_SCRIPT_HASH after editing the inline script")
                .isEqualTo(ApiSecurityFilter.THEME_SCRIPT_HASH);
        assertThat(m.find()).as("any new inline script needs its own CSP hash").isFalse();
    }

    @Test
    void setsSecurityHeadersOnEveryResponseAndNoStoreOnTheApi() throws Exception {
        var filter = new ApiSecurityFilter(12, 60, 10, new TestClock());
        var page = call(filter, new MockHttpServletRequest("GET", "/"));
        assertThat(page.getHeader("Content-Security-Policy")).contains("frame-ancestors 'none'").contains("script-src 'self'");
        assertThat(page.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(page.getHeader("Cache-Control")).isNull();

        var api = call(filter, new MockHttpServletRequest("GET", "/api/health"));
        assertThat(api.getHeader("Cache-Control")).isEqualTo("no-store");
    }

    @Test
    void limitsEachVisitorSeparatelyOnPaidEndpointsThenLetsThemBackIn() throws Exception {
        var clock = new TestClock();
        var filter = new ApiSecurityFilter(2, 60, 10, clock);
        assertThat(call(filter, post("/api/ask", "1.1.1.1")).getStatus()).isEqualTo(200);
        assertThat(call(filter, post("/api/thesis", "1.1.1.1")).getStatus()).isEqualTo(200);
        var limited = call(filter, post("/api/ask", "1.1.1.1"));
        assertThat(limited.getStatus()).isEqualTo(429);
        assertThat(limited.getHeader("Retry-After")).isEqualTo("600");

        assertThat(call(filter, post("/api/ask", "2.2.2.2")).getStatus()).as("another visitor").isEqualTo(200);
        assertThat(call(filter, new MockHttpServletRequest("GET", "/api/tape")).getStatus()).as("cache-only reads").isEqualTo(200);

        clock.now = clock.now.plusSeconds(601);
        assertThat(call(filter, post("/api/ask", "1.1.1.1")).getStatus()).isEqualTo(200);
    }

    @Test
    void aLimitedStreamGetsAnErrorEventTheClientCanShow() throws Exception {
        var filter = new ApiSecurityFilter(1, 60, 10, new TestClock());
        var req = new MockHttpServletRequest("GET", "/api/committee/stream");
        req.setParameter("ticker", "AAPL");
        call(filter, req);
        var res = call(filter, req);
        assertThat(res.getContentType()).startsWith("text/event-stream");
        assertThat(res.getContentAsString()).contains("event:error").contains("\"status\":429");
    }

    @Test
    void identifiesTheVisitorByTheProxyAppendedAddressNotASpoofedOne() {
        var req = new MockHttpServletRequest("GET", "/api/search");
        req.setRemoteAddr("10.0.0.1");
        req.addHeader("X-Forwarded-For", "6.6.6.6, 203.0.113.9");
        assertThat(ApiSecurityFilter.clientOf(req)).isEqualTo("203.0.113.9");
        assertThat(ApiSecurityFilter.clientOf(new MockHttpServletRequest())).isEqualTo("127.0.0.1");
    }

    @Test
    void rejectsOversizedBodies() throws Exception {
        var filter = new ApiSecurityFilter(12, 60, 10, new TestClock());
        var req = post("/api/thesis", "1.1.1.1");
        req.setContent(new byte[(int) ApiSecurityFilter.MAX_BODY_BYTES + 1]);
        assertThat(call(filter, req).getStatus()).isEqualTo(413);
    }
}
