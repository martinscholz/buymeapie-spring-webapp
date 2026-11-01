package technology.scholz.buymeapie.web.route;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(name = "route_assignment", uniqueConstraints = @UniqueConstraint(columnNames = {"account_key", "item_name"}))
public class RouteAssignment {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "account_key", nullable = false, length = 255)
    private String accountKey;

    @Column(name = "item_name", nullable = false, length = 500)
    private String itemName;

    @Column(nullable = false, length = 80)
    private String category;

    protected RouteAssignment() {
    }

    RouteAssignment(String accountKey, String itemName, String category) {
        this.accountKey = accountKey;
        this.itemName = itemName;
        this.category = category;
    }

    String category() {
        return category;
    }

    String itemName() {
        return itemName;
    }

    void setCategory(String category) {
        this.category = category;
    }
}
