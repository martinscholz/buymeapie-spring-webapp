package technology.scholz.buymeapie.web.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import technology.scholz.buymeapie.web.config.BuyMeAPieProperties;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class BuyMeAPieClientTest {
    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void sendsBasicAuthAndParsesLists() throws Exception {
        AtomicReference<String> authorization = new AtomicReference<>();
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/lists", exchange -> {
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            respond(exchange, 200, "[{\"id\":\"groceries\",\"name\":\"Groceries\",\"items_not_purchased\":2}]");
        });
        server.start();

        BuyMeAPieClient client = new BuyMeAPieClient(properties(), new ObjectMapper());

        assertThat(client.listShoppingLists().get(0).path("name").asText()).isEqualTo("Groceries");
        assertThat(authorization.get()).isEqualTo("Basic " + Base64.getEncoder()
                .encodeToString("person@example.com:1234".getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void rejectsUnsafeIdentifiers() {
        BuyMeAPieClient client = new BuyMeAPieClient(new BuyMeAPieProperties(URI.create("http://localhost"),
                "person@example.com", "1234", Duration.ofSeconds(2)), new ObjectMapper());

        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class, () -> client.listItems("../bad"));
    }

    private BuyMeAPieProperties properties() {
        return new BuyMeAPieProperties(URI.create("http://localhost:" + server.getAddress().getPort()),
                "person@example.com", "1234", Duration.ofSeconds(2));
    }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
