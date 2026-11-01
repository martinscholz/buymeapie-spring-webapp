package technology.scholz.buymeapie.web.route;

import com.fasterxml.jackson.databind.JsonNode;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ShoppingRouteService {
    public static final List<Category> CATEGORIES = List.of(
            new Category("produce", "Produce", 10, "#3a8f5d"),
            new Category("bakery", "Bakery", 20, "#bd7b2d"),
            new Category("deli", "Deli & cheese", 30, "#b7556d"),
            new Category("dairy", "Dairy & eggs", 40, "#507bb8"),
            new Category("pantry", "Pantry", 50, "#92733b"),
            new Category("drinks", "Drinks", 60, "#247c91"),
            new Category("frozen", "Frozen", 70, "#6173b8"),
            new Category("household", "Household & care", 80, "#65705c")
    );

    private static final Set<String> CATEGORY_CODES = CATEGORIES.stream().map(Category::code).collect(Collectors.toUnmodifiableSet());
    private final RouteAssignmentRepository assignments;

    public ShoppingRouteService(RouteAssignmentRepository assignments) {
        this.assignments = assignments;
    }

    public List<Category> categories() {
        return CATEGORIES;
    }

    @Transactional(readOnly = true)
    public List<ResolvedItem> resolve(JsonNode account, Collection<ItemToResolve> items) {
        String accountKey = accountKey(account);
        Map<String, String> saved = assignments.findByAccountKeyAndItemNameIn(accountKey, items.stream()
                        .map(item -> normalizedName(item.title())).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(RouteAssignment::itemName, RouteAssignment::category));
        List<ResolvedItem> result = new ArrayList<>();
        for (ItemToResolve item : items) {
            String normalized = normalizedName(item.title());
            String category = saved.get(normalized);
            String suggested = suggestedCategory(normalized);
            result.add(new ResolvedItem(item.id(), category != null ? category : suggested,
                    category != null ? "saved" : suggested != null ? "suggested" : "unassigned"));
        }
        return result;
    }

    @Transactional
    public void assign(JsonNode account, String title, String category) {
        if (!CATEGORY_CODES.contains(category)) {
            throw new IllegalArgumentException("Unknown shopping route category");
        }
        String accountKey = accountKey(account);
        String itemName = normalizedName(title);
        RouteAssignment assignment = assignments.findByAccountKeyAndItemName(accountKey, itemName)
                .orElseGet(() -> new RouteAssignment(accountKey, itemName, category));
        assignment.setCategory(category);
        assignments.save(assignment);
    }

    private String accountKey(JsonNode account) {
        String key = firstText(account, "email", "login", "name");
        return key == null ? "default" : key.toLowerCase(Locale.ROOT);
    }

    private String firstText(JsonNode node, String... names) {
        for (String name : names) {
            if (node.hasNonNull(name) && !node.get(name).asText().isBlank()) return node.get(name).asText();
        }
        return null;
    }

    private String normalizedName(String value) {
        return Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFKD)
                .replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).trim().replaceAll("\\s+", " ");
    }

    private String suggestedCategory(String item) {
        if (contains(item, "apfel", "banana", "tomat", "kartoffel", "salat", "gurke", "paprika", "zwiebel", "karotte", "obst", "gemuse", "fruit", "vegetable", "avocado", "lemon", "zitrone")) return "produce";
        if (contains(item, "brot", "brotchen", "baguette", "toast", "croissant", "br\u00f6tchen", "back", "bread", "roll")) return "bakery";
        if (contains(item, "wurst", "schinken", "salami", "fleisch", "fisch", "kase", "k\u00e4se", "mozzarella", "parmesan", "deli")) return "deli";
        if (contains(item, "milch", "butter", "joghurt", "yogurt", "sahne", "quark", "ei", "egg", "cheese", "hafermilch")) return "dairy";
        if (contains(item, "wasser", "saft", "cola", "bier", "wein", "kaffee", "tee", "drink", "lemonade")) return "drinks";
        if (contains(item, "tiefkuhl", "tiefk\u00fchl", "frozen", "eis", "pizza")) return "frozen";
        if (contains(item, "spul", "sp\u00fcl", "wasch", "toiletten", "papier", "mull", "m\u00fcll", "seife", "shampoo", "zahnpasta", "clean", "detergent")) return "household";
        if (contains(item, "nudel", "pasta", "reis", "mehl", "zucker", "salz", "ol", "\u00f6l", "sauce", "dose", "bohne", "konserve", "cereal", "flour")) return "pantry";
        return null;
    }

    private boolean contains(String item, String... words) {
        return List.of(words).stream().anyMatch(word -> item.contains(word));
    }

    public record Category(String code, String name, int position, String color) {}
    public record ItemToResolve(String id, String title) {}
    public record ResolvedItem(String id, String category, String source) {}
}
