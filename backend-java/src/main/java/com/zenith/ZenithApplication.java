package com.zenith;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class ZenithApplication {

    public static void main(String[] args) {
        SpringApplication.run(ZenithApplication.class, args);
    }
}
