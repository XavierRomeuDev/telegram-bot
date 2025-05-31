# 🤖 Telegram Bot

This project is a Telegram bot developed with Node.js. It uses the `node-telegram-bot-api` library to interact with the Telegram API and a database to manage data persistence.

## 📁 Project Structure

- `bot.js`: Main file containing the bot's logic.
- `dbConfig.js`: Database connection configuration.
- `bot.bat`: Script to run the bot on Windows environments.
- `package.json`: Project's dependency and script management.
- `.gitignore`: Specifies which files/directories to ignore in version control.
- `.gitattributes`: Specific attributes configuration for the repository.

## 🚀 Getting Started

### Prerequisites

Make sure you have the following installed:

- [Node.js](https://nodejs.org/) (version 14 or higher)
- [npm](https://www.npmjs.com/) (Node.js package manager)

### Installation

1. Clone this repository:

   git clone https://github.com/XavierRomeuDev/telegram-bot.git

2. Navigate into the project directory:

  cd telegram-bot

3. Install the required dependencies:

   npm install

## ⚙️ Configuration

Create a .env file in the root of the project with the following environment variables:

TELEGRAM_TOKEN=your_telegram_bot_token
DB_HOST=your_database_host
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_NAME=your_database_name

Make sure to replace the values with your actual credentials.

## ▶️ Running the Bot

To start the bot, run:

node bot.js

Or, if you're on a Windows environment, you can use the bot.bat script:

bot.bat

## 🛠️ Features

Currently, the bot provides the following features:

- Automatic responses to specific messages.
- Custom command handling.
- Interaction with a database to store persistent information.

## 🤝 Contributing

Contributions are welcome! If you want to add features, fix bugs, or improve the project, feel free to open an issue or submit a pull request.

## 📄 License

This project is licensed under the MIT license. See the LICENSE file for more information.
