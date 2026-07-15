package technology.scholz.buymeapie.web.controller;

import jakarta.validation.ConstraintViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import technology.scholz.buymeapie.web.client.BuyMeAPieClient;

import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(BuyMeAPieClient.BuyMeAPieException.class)
    ResponseEntity<Map<String, Object>> buyMeAPie(BuyMeAPieClient.BuyMeAPieException exception) {
        HttpStatus status = HttpStatus.resolve(exception.statusCode());
        return ResponseEntity.status(status == null ? HttpStatus.BAD_GATEWAY : status)
                .body(Map.of("message", exception.getMessage(), "source", "buymeapie"));
    }

    @ExceptionHandler({IllegalArgumentException.class, ConstraintViolationException.class, MethodArgumentNotValidException.class})
    ResponseEntity<Map<String, Object>> badRequest(Exception exception) {
        return ResponseEntity.badRequest().body(Map.of("message", exception.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String, Object>> unexpected(Exception exception) {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("message", exception.getMessage()));
    }
}
