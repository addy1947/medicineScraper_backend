// Barrel exporting all tool modules from the tools folder
module.exports = {
  ...require('./apolloTool'),
  ...require('./pharmeasyTool'),
  ...require('./netmedsTool'),
  ...require('./onemgTool'),
  ...require('./trumedsTool'),
};
