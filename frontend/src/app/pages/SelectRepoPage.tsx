import { useNavigate } from 'react-router-dom';
import Navbar from '../components/hero/navbar';
import Footer from '../components/hero/footer';
import MainCompo from '../components/hero/mainCompo';
import bg from '../../assets/background.png';
import './Home.css';

export default function SelectRepoPage() {
  const navigate = useNavigate();

  return (
    <>
      <div className="global-bg" style={{ backgroundImage: `url(${bg})` }} />
      <button
        className="page-back-btn"
        onClick={() => navigate('/home')}
      >
        ← Back
      </button>
      <div className="app">
        <Navbar />
        <MainCompo />
        <Footer />
      </div>
    </>
  );
}
