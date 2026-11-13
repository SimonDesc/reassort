package fr.reassort.mcp;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Ce qu'il faut pour brancher un assistant sur la démo. L'application de démonstration est ouverte à tous : le jeton
 * écarte les robots qui balaient /mcp, pas les visiteurs. Avec une authentification par officine, il deviendrait
 * personnel et ne serait plus servi ici.
 */
@RestController
class ConnexionMcpController {

	private final String jeton;

	ConnexionMcpController(@Value("${reassort.mcp.jeton:}") String jeton) {
		this.jeton = jeton;
	}

	@GetMapping("/api/mcp/connexion")
	Connexion connexion() {
		return new Connexion(jeton.isBlank() ? null : jeton);
	}

	record Connexion(String jeton) {
	}
}
