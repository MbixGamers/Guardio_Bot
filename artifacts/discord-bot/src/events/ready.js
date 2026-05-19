export default {
  name: 'clientReady',
  once: true,
  async execute(client) {
    console.log(`[BOT] Ready as ${client.user.tag}`);
    client.user.setActivity('Watching the server', { type: 3 });
  },
};
