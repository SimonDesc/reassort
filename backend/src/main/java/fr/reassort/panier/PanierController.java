package fr.reassort.panier;

import java.util.List;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
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

	@GetMapping
	List<Panier> historique() {
		return paniers.historique();
	}

	/** Modifier une ligne du brouillon : quantité, ou offre retenue (autre fournisseur). */
	@PatchMapping("/{id}/lignes/{ligneId}")
	Panier modifierLigne(@PathVariable UUID id, @PathVariable long ligneId, @RequestBody ModificationLigne modification) {
		return paniers.modifierLigne(id, ligneId, modification.quantite(), modification.offreId());
	}

	/** Ajouter au brouillon un produit que le calcul n'avait pas retenu. */
	@PostMapping("/{id}/lignes")
	Panier ajouterProduit(@PathVariable UUID id, @RequestBody AjoutProduit ajout) {
		return paniers.ajouterProduit(id, ajout.cip13());
	}

	record AjoutProduit(String cip13) {
	}

	@DeleteMapping("/{id}/lignes/{ligneId}")
	Panier retirerLigne(@PathVariable UUID id, @PathVariable long ligneId) {
		return paniers.retirerLigne(id, ligneId);
	}

	/** Les cartons d'un fournisseur sont arrivés à l'officine. */
	@PostMapping("/{id}/receptions/{fournisseurId}")
	Panier recevoir(@PathVariable UUID id, @PathVariable String fournisseurId) {
		return paniers.recevoir(id, fournisseurId);
	}

	record ModificationLigne(Integer quantite, Long offreId) {
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
