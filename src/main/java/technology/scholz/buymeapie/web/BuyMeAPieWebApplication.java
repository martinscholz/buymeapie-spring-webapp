package technology.scholz.buymeapie.web;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.cache.annotation.EnableCaching;

@SpringBootApplication
@ConfigurationPropertiesScan
@EnableCaching
public class BuyMeAPieWebApplication {
    public static void main(String[] args) {
        SpringApplication.run(BuyMeAPieWebApplication.class, args);
    }
}
