const sgMail = require("@sendgrid/mail");
require("dotenv").config();

const { SEND_GRID_API_KEY } = process.env;

sgMail.setApiKey(SEND_GRID_API_KEY);

const sendMail = async (data) => {
  const mail = { ...data, from: "juniorseniors.dev@gmail.com" };
  try {
    await sgMail.send(mail);
    return true;
  } catch (error) {
    console.log(error); // to avoid eslint warning underline
    throw error;
  }
};

module.exports = sendMail;
