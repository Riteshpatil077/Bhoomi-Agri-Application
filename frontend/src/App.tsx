import { AppRouter } from "./app/AppRouter";
import { ToastProvider } from "./design-system";
import { AuthProvider } from "./context/AuthContext";
import { LanguageProvider } from "./i18n/LanguageContext";

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <LanguageProvider>
          <AppRouter />
        </LanguageProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;

