package technology.scholz.buymeapie.web.route;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

interface RouteAssignmentRepository extends JpaRepository<RouteAssignment, Long> {
    List<RouteAssignment> findByAccountKeyAndItemNameIn(String accountKey, Collection<String> itemNames);
    Optional<RouteAssignment> findByAccountKeyAndItemName(String accountKey, String itemName);
}
