// src/routes/logout/+server.js
import { redirect } from '@sveltejs/kit';

export async function POST({ locals }) {
	await locals.supabase?.auth.signOut();
	redirect(303, '/login');
}
