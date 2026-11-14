// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { SheetData } from '#lib/game/types.ts';
import type { Auth } from '#lib/server/auth/create-auth.ts';

type AuthSession = Auth['$Infer']['Session'];

declare global {
	namespace App {
		interface Error {
			message: string;
			/** Reference shown to the user and logged with the real error. */
			errorId?: string;
		}
		interface Locals {
			/** The signed-in user, or null. Set by the auth handle in hooks.server.ts. */
			user: AuthSession['user'] | null;
			session: AuthSession['session'] | null;
		}
		// interface PageData {}
		interface PageState {
			/** A habit sheet shown over the card (shallow routing to /card/squares/[id]). */
			sheet?: SheetData;
		}
		// interface Platform {}
	}
}

export {};
