const path = require('path')
const CopyPlugin = require('copy-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const stringReplacement = require('./build-support/string-replacement')
const {
  entry,
  dest,
  assetDest,
  assets,
  outputFileName
} = require('./build-support/build-opts')

module.exports = (env) => ({
  performance: { hints: false },
  context: path.resolve(__dirname, 'src'),
  entry: entry,
  output: {
    filename: outputFileName,
    path: path.resolve(__dirname, dest)
  },
  module: {
    rules: [
      {
        test: /\.coffee$/,
        use: ['coffee-loader']
      },
      {
        test: /\.styl$/,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader', // translates CSS into CommonJS
            options: {
              url: false
            }
          },
          {
            loader: 'stylus-loader' // compiles Stylus to CSS
          }
        ]
      }
    ]
  },
  resolve: {
    extensions: [ '.coffee', '.js', '.json', '.styl' ]
  },
  plugins: [
    new MiniCssExtractPlugin(),
    new CopyPlugin(
      assets.map(name => {
        return ({
          from: path.resolve(__dirname, `./src/assets/${name}`),
          to: path.resolve(__dirname, `${dest}/${name}`),
          transform: stringReplacement
        })
      })
    )
  ],
  devServer: {
    port: 8080
  }
})
