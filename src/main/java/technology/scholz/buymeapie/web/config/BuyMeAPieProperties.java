package technology.scholz.buymeapie.web.config;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.net.URI;
import java.time.Duration;

@Validated
@ConfigurationProperties(prefix = "buymeapie")
public record BuyMeAPieProperties(
        URI baseUrl,
        @NotBlank String username,
        @NotBlank String pin,
        Duration timeout) {
    public BuyMeAPieProperties {
        if (baseUrl == null) {
            baseUrl = URI.create("https://api.buymeapie.com");
        }
        if (timeout == null) {
            timeout = Duration.ofSeconds(20);
        }
    }
}
