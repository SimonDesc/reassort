package fr.reassort.panier;

import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

@RestController
@RequestMapping("/api/paniers")
class PanierController {

	private final PanierService paniers;

	PanierController(PanierService paniers) {
		this.paniers = paniers;
	}

	/** Propose un panier pour couvrir les {@code horizon} prochains jours ; remplace le brouillon en cours. */
	@PostMapping
	ResponseEntity<Panier> proposer(@RequestParam(defaultValue = "7") @Min(1) @Max(60) int horizon) {
		Panier panier = paniers.proposer(horizon);
		return ResponseEntity.created(java.net.URI.create("/api/paniers/" + panier.id())).body(panier);
	}

	@GetMapping("/dernier")
	ResponseEntity<Panier> dernier() {
		return ResponseEntity.of(paniers.dernier());
	}

	@GetMapping("/{id}")
	Panier lire(@PathVariable UUID id) {
		return paniers.lire(id);
	}

	@PostMapping("/{id}/validation")
	Panier valider(@PathVariable UUID id) {
		return paniers.valider(id);
	}
}
