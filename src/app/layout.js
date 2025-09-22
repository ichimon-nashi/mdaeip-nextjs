import { AuthProvider } from '../contexts/AuthContext';
import Layout from '../components/Layout';
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
      </body>
    </html>
  );
}