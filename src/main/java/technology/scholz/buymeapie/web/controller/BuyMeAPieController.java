package technology.scholz.buymeapie.web.controller;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import technology.scholz.buymeapie.web.client.BuyMeAPieClient;

@RestController
@RequestMapping("/api")
public class BuyMeAPieController {
    private final BuyMeAPieClient client;

    public BuyMeAPieController(BuyMeAPieClient client) {
        this.client = client;
    }

    @GetMapping("/account")
    JsonNode account() throws Exception {
        return client.whoAmI();
    }

    @GetMapping("/restrictions")
    JsonNode restrictions() throws Exception {
        return client.restrictions();
    }

    @GetMapping("/lists")
    JsonNode lists() throws Exception {
        return client.listShoppingLists();
    }

    @PostMapping("/lists")
    @ResponseStatus(HttpStatus.CREATED)
    JsonNode createList(@Valid @RequestBody ListRequest request) throws Exception {
        return client.createList(request.name());
    }

    @GetMapping("/lists/{listId}")
    JsonNode getList(@PathVariable String listId) throws Exception {
        return client.getShoppingList(listId);
    }

    @PutMapping("/lists/{listId}")
    JsonNode updateList(@PathVariable String listId, @Valid @RequestBody ListRequest request) throws Exception {
        return client.updateList(listId, request.name(), request.emails());
    }

    @DeleteMapping("/lists/{listId}")
    JsonNode deleteList(@PathVariable String listId) throws Exception {
        return client.deleteList(listId);
    }

    @GetMapping("/lists/{listId}/items")
    JsonNode items(@PathVariable String listId) throws Exception {
        return client.listItems(listId);
    }

    @PostMapping("/lists/{listId}/items")
    @ResponseStatus(HttpStatus.CREATED)
    JsonNode addItem(@PathVariable String listId, @Valid @RequestBody CreateItemRequest request) throws Exception {
        return client.addShoppingItem(listId, request.title(), request.amount(), Boolean.TRUE.equals(request.purchased()), request.group());
    }

    @PatchMapping("/lists/{listId}/items/{itemId}")
    JsonNode updateItem(@PathVariable String listId, @PathVariable String itemId, @RequestBody ItemRequest request)
            throws Exception {
        return client.updateItem(listId, itemId, request.title(), request.amount(), request.purchased(), request.group());
    }

    @PutMapping("/lists/{listId}/items/{itemId}/purchased")
    JsonNode setPurchased(@PathVariable String listId, @PathVariable String itemId, @RequestBody PurchasedRequest request)
            throws Exception {
        return client.updateItem(listId, itemId, null, null, request.purchased(), null);
    }

    @DeleteMapping("/lists/{listId}/items/{itemId}")
    JsonNode deleteItem(@PathVariable String listId, @PathVariable String itemId) throws Exception {
        return client.deleteItem(listId, itemId);
    }

    @GetMapping("/unique-items")
    JsonNode uniqueItems() throws Exception {
        return client.uniqueItems();
    }

    public record ListRequest(@NotBlank String name, JsonNode emails) {}
    public record CreateItemRequest(@NotBlank String title, String amount, Boolean purchased, String group) {}
    public record ItemRequest(String title, String amount, Boolean purchased, String group) {}
    public record PurchasedRequest(Boolean purchased) {}
}
