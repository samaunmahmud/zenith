package com.zenith;

import java.util.Arrays;
import java.util.List;
import org.springframework.boot.Banner;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * Starts the web server, or, with --smoke / --precache, runs a one-off command-line task
 * (see com.zenith.cli) without starting the server.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class ZenithApplication {

    static final List<String> CLI_FLAGS = List.of("--smoke", "--precache");

    public static void main(String[] args) {
        boolean cli = Arrays.stream(args).anyMatch(CLI_FLAGS::contains);
        new SpringApplicationBuilder(ZenithApplication.class)
                .web(cli ? WebApplicationType.NONE : WebApplicationType.SERVLET)
                .bannerMode(cli ? Banner.Mode.OFF : Banner.Mode.CONSOLE)
                .logStartupInfo(!cli)
                .run(args);
    }
}
