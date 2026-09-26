import { AppRouter } from "./app/AppRouter";
import { ToastProvider } from "./design-system";
import { AuthProvider } from "./context/AuthContext";

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;

