import { BrowserRouter, Routes, Route } from 'react-router-dom';

import Home from './pages/Home';
import PixiApp from './PixiApp';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/game" element={<PixiApp />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
