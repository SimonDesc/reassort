package fr.reassort.panier;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Événement publié quand le pharmacien valide un panier.
 *
 * <p>Dans la démo, il est seulement journalisé, une fois la transaction validée. En production, c'est ici qu'un
 * producteur Kafka publierait sur un topic {@code commandes.validees} : chaque fournisseur reçoit sa commande, la
 * facturation et le suivi de réception (« les cartons à l'officine ») s'abonnent sans que le panier les connaisse.
 */
public record PanierValide(UUID panierId, Instant valideLe, BigDecimal total, int nombreCommandes) {

	@Component
	static class Journal {

		private static final Logger LOG = LoggerFactory.getLogger(PanierValide.class);

		@TransactionalEventListener
		void journaliser(PanierValide evenement) {
			LOG.info("Panier {} validé : {} commande(s) fournisseur, {} € HT", evenement.panierId(),
					evenement.nombreCommandes(), evenement.total());
		}
	}
}
