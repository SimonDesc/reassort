package fr.reassort.mcp;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Le serveur MCP peut valider des commandes : en ligne, il exige un jeton (REASSORT_MCP_JETON), envoyé par le client
 * MCP en en-tête {@code Authorization: Bearer …}. Sans jeton configuré (développement local), l'accès reste ouvert.
 */
@Configuration(proxyBeanMethods = false)
class JetonMcp {

	private static final Logger LOG = LoggerFactory.getLogger(JetonMcp.class);

	@Bean
	FilterRegistrationBean<OncePerRequestFilter> filtreJetonMcp(@Value("${reassort.mcp.jeton:}") String jeton) {
		if (jeton.isBlank()) {
			LOG.warn("Serveur MCP sans jeton : accès ouvert. Définir REASSORT_MCP_JETON en production.");
		}
		byte[] attendu = ("Bearer " + jeton).getBytes(StandardCharsets.UTF_8);
		OncePerRequestFilter filtre = new OncePerRequestFilter() {
			@Override
			protected void doFilterInternal(HttpServletRequest requete, HttpServletResponse reponse, FilterChain suite)
					throws ServletException, IOException {
				String recu = requete.getHeader(HttpHeaders.AUTHORIZATION);
				boolean autorise = jeton.isBlank() || (recu != null
						&& MessageDigest.isEqual(attendu, recu.getBytes(StandardCharsets.UTF_8)));
				if (!autorise) {
					reponse.setStatus(HttpStatus.UNAUTHORIZED.value());
					reponse.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Bearer");
					return;
				}
				suite.doFilter(requete, reponse);
			}
		};
		FilterRegistrationBean<OncePerRequestFilter> enregistrement = new FilterRegistrationBean<>(filtre);
		enregistrement.addUrlPatterns("/mcp", "/mcp/*");
		return enregistrement;
	}
}
