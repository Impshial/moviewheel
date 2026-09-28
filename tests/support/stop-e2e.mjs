export default async function teardown() {
  // Stop our isolated fixture explicitly, including its Windows child process.
  await fetch("http://127.0.0.1:54329/__test/shutdown", { method: "POST" }).catch(() => {});
}
