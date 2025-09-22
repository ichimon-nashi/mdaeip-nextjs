import { AuthProvider } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { Toaster } from 'react-hot-toast';
import './globals.css';

export const metadata = {
  title: '豪神APP',
  description: '豪神APP',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Layout>
            {children}
          </Layout>
        </AuthProvider>
        <Toaster 
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
            },
          }}
        />
      </body>
    </html>
  );
}