// hash-passwords.js - Run this script to generate password hashes
// Usage: node hash-passwords.js

const bcrypt = require("bcryptjs");

// Your current approved users data
const approvedUsers = [
	{ id: "59161", name: "王儀珺", password: "123456" },
	{ id: "59230", name: "葉蓉婷", password: "123456" },
];

async function hashAllPasswords() {
	console.log("Generating bcrypt hashes...\n");

	const saltRounds = 12;

	for (const user of approvedUsers) {
		try {
			const hash = await bcrypt.hash(user.password, saltRounds);
			console.log(`${user.id}/${user.name}: ${hash}`);
		} catch (error) {
			console.error(`Error hashing password for ${user.id}:`, error);
		}
	}

	console.log("\n--- SQL UPDATE STATEMENTS ---\n");

	for (const user of approvedUsers) {
		try {
			const hash = await bcrypt.hash(user.password, saltRounds);
			console.log(
				`UPDATE mdaeip_users SET password = '${hash}' WHERE id = '${user.id}';`
			);
		} catch (error) {
			console.error(`Error generating SQL for ${user.id}:`, error);
		}
	}
}

// Run the hashing
hashAllPasswords().catch(console.error);
