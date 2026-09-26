package com.zenith.indicators;

import java.util.Locale;

/** Numbers are formatted ONCE, here, and agents copy the strings verbatim. */
public final class Format {

    public static final String NA = "not available";

    private Format() {}

    private static String f(double x, int digits) {
        return String.format(Locale.ROOT, "%." + digits + "f", x);
    }

    public static String pct(Double x) {
        return pct(x, false, 1);
    }

    public static String signedPct(Double x) {
        return pct(x, true, 1);
    }

    public static String pct(Double x, boolean signed, int digits) {
        if (x == null) return NA;
        return (signed && x > 0 ? "+" : "") + f(x * 100, digits) + "%";
    }

    public static String fixed(Double x, int digits) {
        return x == null ? NA : f(x, digits);
    }

    public static String fixed(Double x) {
        return fixed(x, 2);
    }

    public static String compact(Double x) {
        if (x == null) return NA;
        double abs = Math.abs(x);
        if (abs >= 1e12) return f(x / 1e12, 2) + "T";
        if (abs >= 1e9) return f(x / 1e9, 2) + "B";
        if (abs >= 1e6) return f(x / 1e6, 2) + "M";
        if (abs >= 1e3) return f(x / 1e3, 1) + "K";
        return f(x, 0);
    }

    public static String money(Double x, String currency, boolean big) {
        if (x == null) return NA;
        String body = big ? compact(x) : f(x, 2);
        return currency != null && !currency.equals("USD") ? body + " " + currency : "$" + body;
    }

    public static String money(Double x, String currency) {
        return money(x, currency, false);
    }
}
