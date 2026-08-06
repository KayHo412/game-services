module.exports = {
  betterAuth: function () {
    return {
      api: {
        getSession: async () => null,
      },
    };
  },
};
