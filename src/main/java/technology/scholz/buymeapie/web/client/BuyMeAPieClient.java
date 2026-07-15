package technology.scholz.buymeapie.web.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.cache.annotation.Caching;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import technology.scholz.buymeapie.web.config.BuyMeAPieProperties;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

@Component
public class BuyMeAPieClient {
    private final BuyMeAPieProperties properties;
    private final ObjectMapper mapper;
    private final HttpClient http;
    private final String authorization;

    public BuyMeAPieClient(BuyMeAPieProperties properties, ObjectMapper mapper) {
        this.properties = properties;
        this.mapper = mapper;
        this.http = HttpClient.newBuilder()
                .connectTimeout(properties.timeout())
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
        String credentials = properties.username() + ":" + properties.pin();
        this.authorization = "Basic " + Base64.getEncoder()
                .encodeToString(credentials.getBytes(StandardCharsets.UTF_8));
    }

    @Cacheable("account")
    public JsonNode whoAmI() throws IOException, InterruptedException {
        return request("GET", "/bauth", null);
    }

    @Cacheable("restrictions")
    public JsonNode restrictions() throws IOException, InterruptedException {
        return request("GET", "/restrictions", null);
    }

    @Cacheable("lists")
    public JsonNode listShoppingLists() throws IOException, InterruptedException {
        return request("GET", "/lists", null);
    }

    @Cacheable(cacheNames = "listDetails", key = "#listId")
    public JsonNode getShoppingList(String listId) throws IOException, InterruptedException {
        ObjectNode result = mapper.createObjectNode();
        JsonNode lists = listShoppingLists();
        if (lists.isArray()) {
            for (JsonNode list : lists) {
                if (encodePath(list.path("id").asText()).equals(encodePath(listId))) {
                    result.set("list", list);
                    result.set("items", listItems(listId));
                    return result;
                }
            }
        }
        throw new BuyMeAPieException(404, "List not found");
    }

    @Cacheable(cacheNames = "listItems", key = "#listId")
    public JsonNode listItems(String listId) throws IOException, InterruptedException {
        return request("GET", "/lists/" + encodePath(listId) + "/items", null);
    }

    @Cacheable("uniqueItems")
    public JsonNode uniqueItems() throws IOException, InterruptedException {
        return request("GET", "/unique_items", null);
    }

    @Caching(evict = {
            @CacheEvict(cacheNames = "lists", allEntries = true),
            @CacheEvict(cacheNames = "listDetails", allEntries = true),
            @CacheEvict(cacheNames = "listItems", allEntries = true)
    })
    public JsonNode createList(String name) throws IOException, InterruptedException {
        ObjectNode payload = mapper.createObjectNode()
                .put("name", name)
                .put("items_purchased", 0)
                .put("items_not_purchased", 0);
        return request("POST", "/lists", payload);
    }

    @Caching(evict = {
            @CacheEvict(cacheNames = "lists", allEntries = true),
            @CacheEvict(cacheNames = "listDetails", allEntries = true),
            @CacheEvict(cacheNames = "listItems", allEntries = true)
    })
    public JsonNode updateList(String listId, String name, JsonNode emails) throws IOException, InterruptedException {
        ObjectNode current = findList(listId);
        ObjectNode payload = mapper.createObjectNode();
        payload.put("name", name == null ? current.path("name").asText() : name);
        payload.set("emails", emails == null ? current.path("emails").deepCopy() : emails);
        return request("PUT", "/lists/" + encodePath(listId), payload);
    }

    @Caching(evict = {
            @CacheEvict(cacheNames = "lists", allEntries = true),
            @CacheEvict(cacheNames = "listDetails", allEntries = true),
            @CacheEvict(cacheNames = "listItems", allEntries = true)
    })
    public JsonNode deleteList(String listId) throws IOException, InterruptedException {
        return request("DELETE", "/lists/" + encodePath(listId), null);
    }

    @Caching(evict = {
            @CacheEvict(cacheNames = "lists", allEntries = true),
            @CacheEvict(cacheNames = "listDetails", allEntries = true),
            @CacheEvict(cacheNames = "listItems", allEntries = true),
            @CacheEvict(cacheNames = "uniqueItems", allEntries = true)
    })
    public JsonNode addShoppingItem(String listId, String title, String amount, boolean purchased, String group)
            throws IOException, InterruptedException {
        ObjectNode payload = mapper.createObjectNode()
                .put("title", title)
                .put("amount", amount == null ? "" : amount)
                .put("is_purchased", purchased);
        putGroup(payload, group);
        return request("POST", "/lists/" + encodePath(listId) + "/items", payload);
    }

    @Caching(evict = {
            @CacheEvict(cacheNames = "lists", allEntries = true),
            @CacheEvict(cacheNames = "listDetails", allEntries = true),
            @CacheEvict(cacheNames = "listItems", allEntries = true),
            @CacheEvict(cacheNames = "uniqueItems", allEntries = true)
    })
    public JsonNode updateItem(String listId, String itemId, String title, String amount, Boolean purchased, String group)
            throws IOException, InterruptedException {
        ObjectNode payload = mapper.createObjectNode();
        if (title != null) payload.put("title", title);
        if (amount != null) payload.put("amount", amount);
        if (purchased != null) payload.put("is_purchased", purchased);
        putGroup(payload, group);
        if (payload.isEmpty()) throw new IllegalArgumentException("At least one item field must be supplied");
        return request("PUT", "/lists/" + encodePath(listId) + "/items/" + encodePath(itemId), payload);
    }

    @Caching(evict = {
            @CacheEvict(cacheNames = "lists", allEntries = true),
            @CacheEvict(cacheNames = "listDetails", allEntries = true),
            @CacheEvict(cacheNames = "listItems", allEntries = true)
    })
    public JsonNode deleteItem(String listId, String itemId) throws IOException, InterruptedException {
        return request("DELETE", "/lists/" + encodePath(listId) + "/items/" + encodePath(itemId), null);
    }

    private static void putGroup(ObjectNode payload, String group) {
        if (group != null && !group.isBlank()) {
            payload.put("group", group.trim());
        }
    }

    private ObjectNode findList(String listId) throws IOException, InterruptedException {
        JsonNode lists = listShoppingLists();
        if (lists.isArray()) {
            for (JsonNode list : lists) {
                if (listId.equals(list.path("id").asText()) && list.isObject()) return (ObjectNode) list;
            }
        }
        throw new BuyMeAPieException(404, "List not found");
    }

    private JsonNode request(String method, String path, JsonNode payload) throws IOException, InterruptedException {
        URI uri = URI.create(properties.baseUrl().toString().replaceAll("/$", "") + path);
        HttpRequest.Builder builder = HttpRequest.newBuilder(uri)
                .timeout(properties.timeout())
                .header(HttpHeaders.AUTHORIZATION, authorization)
                .header(HttpHeaders.ACCEPT, "application/json")
                .header(HttpHeaders.ACCEPT_LANGUAGE, "en")
                .header(HttpHeaders.USER_AGENT, "buymeapie-spring-webapp/0.1");
        if (payload == null) {
            builder.method(method, HttpRequest.BodyPublishers.noBody());
        } else {
            builder.header(HttpHeaders.CONTENT_TYPE, "application/json")
                    .method(method, HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(payload)));
        }
        HttpResponse<String> response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new BuyMeAPieException(response.statusCode(), sanitize(response.body()));
        }
        if (response.body() == null || response.body().isBlank()) {
            return mapper.createObjectNode().put("success", true);
        }
        return mapper.readTree(response.body());
    }

    private static String encodePath(String value) {
        if (value == null || value.isBlank() || !value.matches("[A-Za-z0-9._-]+")) {
            throw new IllegalArgumentException("Invalid identifier");
        }
        return value;
    }

    private static String sanitize(String body) {
        if (body == null) return "";
        return body.length() <= 500 ? body : body.substring(0, 500) + "...";
    }

    public static final class BuyMeAPieException extends IOException {
        private final int statusCode;

        public BuyMeAPieException(int statusCode, String responseBody) {
            super("Buy Me a Pie request failed with HTTP " + statusCode + ": " + responseBody);
            this.statusCode = statusCode;
        }

        public int statusCode() {
            return statusCode;
        }
    }
}
