import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useGetMe, AuthUser } from "@workspace/api-client-react";

interface AuthContextType {
  user: AuthUser | null | undefined; // undefined means loading
  isLoading: boolean;
  loginUser: (user: AuthUser) => void;
  logoutUser: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading, error } = useGetMe({
    query: {
      retry: false,
    }
  });

  const [currentUser, setCurrentUser] = useState<AuthUser | null | undefined>(undefined);

  useEffect(() => {
    if (!isLoading) {
      setCurrentUser(user || null);
    }
  }, [user, isLoading]);

  const loginUser = (user: AuthUser) => {
    setCurrentUser(user);
  };

  const logoutUser = () => {
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider value={{ user: currentUser, isLoading: isLoading && currentUser === undefined, loginUser, logoutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
