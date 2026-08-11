import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, LogOut } from 'lucide-react';
import { useSupportView } from '../context/SupportViewContext';

export default function SupportViewBanner() {
  const { actif, boutiqueNom, quitter } = useSupportView();
  const navigate = useNavigate();

  if (!actif) return null;

  const handleQuitter = () => {
    quitter();
    navigate('/admin-plateforme');
  };

  return (
    <div className="bg-orange-500 text-white px-4 py-2 flex items-center justify-between gap-4 flex-wrap sticky top-0 z-50 shadow-md">
      <span className="flex items-center gap-2 font-medium text-sm">
        <Search className="w-4 h-4" />
        Vue Support active sur <strong>{boutiqueNom}</strong> — Lecture seule
      </span>
      <button
        onClick={handleQuitter}
        className="flex items-center gap-1 px-3 py-1 bg-white text-orange-700 rounded-md text-xs font-semibold hover:bg-orange-50 transition"
      >
        <LogOut className="w-3 h-3" /> Quitter la Vue Support
      </button>
    </div>
  );
}
