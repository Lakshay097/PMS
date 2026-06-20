import React from 'react';
import { User } from '../types/index';
import LoginScreen from '../components/features/auth/LoginScreen';

interface LoginPageProps {
  usersList: User[];
  onLoginSuccess: (email: string, user: User) => void;
}

export default function LoginPage({ usersList, onLoginSuccess }: LoginPageProps) {
  return <LoginScreen usersList={usersList} onLoginSuccess={onLoginSuccess} />;
}
