package com.zenith.data;

/** Market data problem, with the HTTP status the API should answer with (404 unknown ticker, 502 upstream error). */
public class DataException extends RuntimeException {

    private final int status;

    public DataException(String message, int status) {
        super(message);
        this.status = status;
    }

    public DataException(String message) {
        this(message, 502);
    }

    public int status() {
        return status;
    }
}
