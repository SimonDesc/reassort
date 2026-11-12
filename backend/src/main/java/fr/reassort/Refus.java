package fr.reassort;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/** Un refus métier, renvoyé au format Problem Details (RFC 9457) avec un message lisible par le pharmacien. */
public class Refus extends ErrorResponseException {

	public Refus(HttpStatus statut, String detail) {
		super(statut, ProblemDetail.forStatusAndDetail(statut, detail), null);
	}

	@Override
	public String getMessage() {
		return getBody().getDetail();
	}
}
