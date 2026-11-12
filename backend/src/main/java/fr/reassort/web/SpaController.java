package fr.reassort.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * Le front React est servi par Spring Boot (fichiers statiques) : toute adresse
 * sans extension hors de /api et /mcp renvoie l'index, le routeur du front prend le relais.
 */
@Controller
class SpaController {

	@GetMapping({ "/", "/{chemin:^(?!api|mcp|actuator)[^.]*}", "/{chemin:^(?!api|mcp|actuator)[^.]*}/**" })
	String index() {
		return "forward:/index.html";
	}
}
