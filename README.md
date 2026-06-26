# InterviewAI 🚀

Generate hyper-relevant interview questions tailored to your role, experience, and target company. Practice smarter with AI-generated answers, structured guidance, and real-time evaluation.

🌐 **Live Demo:** [InterviewAI on Vercel](https://ai-interview-question-generator-chi.vercel.app/)

---

## ✨ Features

* **Tailored Question Generation:** Get interview questions customized precisely to your target job description, role, experience level, and company.
* **AI-Powered Feedback:** Receive smart, structured answers and actionable guidance to improve your responses.
* **Firebase Agent Integration:** Utilizes advanced Firebase agent skills for AI logic, secure authentication, and app hosting.
* **Dynamic Routing:** Seamless navigation across fully public features, personalized dashboards, and about pages.
* **Modern UI/UX:** Built with a beautiful, responsive interface styled using Tailwind CSS and `shadcn/ui`.

---

## 🛠️ Tech Stack

* **Frontend:**  React, Vite
* **Styling:** Tailwind CSS, Shadcn UI (`default_shadcn_theme.css`)
* **Backend & AI Logic:** Firebase (Auth, App Hosting, GenKit/AI Agents)
* **Package Manager:** Monorepo support via `pnpm`

---

## 📁 Project Structure

```text
├── .agents/               # Firebase Agent configurations & AI skills
├── guidelines/            # Documentation and development guidelines
├── src/                   # Application source code
│   ├── components/        # Reusable UI components
│   ├── pages/             # Navigation pages (Features, About, Dashboard)
│   └── main.tsx           # Application entry point
├── .env.example           # Example environment variables
├── firebase.json          # Firebase configuration file
├── vite.config.ts         # Vite bundler configuration
└── package.json           # Project dependencies and scripts
