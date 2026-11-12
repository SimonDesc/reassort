package fr.reassort.prevision;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import fr.reassort.prevision.CalculPrevision.Prevision;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

@RestController
@RequestMapping("/api/previsions")
class PrevisionController {

	private final PrevisionService previsions;

	PrevisionController(PrevisionService previsions) {
		this.previsions = previsions;
	}

	/** Tous les produits suivis, les plus urgents d'abord ; horizon : nombre de jours que la commande doit couvrir. */
	@GetMapping
	List<Prevision> lister(@RequestParam(defaultValue = "7") @Min(1) @Max(60) int horizon) {
		return previsions.prevoir(horizon);
	}
}
