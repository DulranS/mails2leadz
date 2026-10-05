// lib/redux/hooks.js
import { useDispatch, useSelector } from 'react-redux';
import { store } from './store';

// Typed hooks (for TypeScript projects, these would have proper types)
export const useAppDispatch = () => useDispatch();
export const useAppSelector = useSelector;
