import React from 'react';
import AccountRequest from '../components/features/auth/AccountRequest';

interface AccountRequestPageProps {
  onBack: () => void;
}

export default function AccountRequestPage({ onBack }: AccountRequestPageProps) {
  return (
    <AccountRequest
      onBackToLogin={onBack}
      onRequestSubmitted={() => {
        // After successful submission, go back
        onBack();
      }}
    />
  );
}
