package fr.reassort.destockage;

import java.math.BigDecimal;
import java.net.URI;
import java.time.LocalDate;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import fr.reassort.destockage.DestockageService.Annonce;
import fr.reassort.destockage.DestockageService.Publication;
import fr.reassort.destockage.DestockageService.Suggestion;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;

@RestController
@RequestMapping("/api/destockage")
class DestockageController {

	private final DestockageService destockage;

	DestockageController(DestockageService destockage) {
		this.destockage = destockage;
	}

	@GetMapping("/suggestions")
	List<Suggestion> suggestions() {
		return destockage.suggestions();
	}

	@GetMapping("/annonces")
	List<Annonce> annonces() {
		return destockage.annonces();
	}

	@PostMapping("/annonces")
	ResponseEntity<Annonce> publier(@Valid @RequestBody DemandePublication demande) {
		Annonce annonce = destockage.publier(
				new Publication(demande.cip13(), demande.quantite(), demande.prixUnitaire(), demande.peremption()));
		return ResponseEntity.created(URI.create("/api/destockage/annonces/" + annonce.id())).body(annonce);
	}

	@DeleteMapping("/annonces/{id}")
	ResponseEntity<Void> retirer(@PathVariable long id) {
		destockage.retirer(id);
		return ResponseEntity.noContent().build();
	}

	record DemandePublication(
			@NotNull @Pattern(regexp = "\\d{13}") String cip13,
			@Positive int quantite,
			@NotNull @DecimalMin("0.01") BigDecimal prixUnitaire,
			@NotNull LocalDate peremption) {
	}
}
