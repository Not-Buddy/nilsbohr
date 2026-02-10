import Navbar from '../components/hero/navbar';
import MainCompo from '../components/hero/mainCompo';
import Footer from '../components/hero/footer';
import bg from '../../assets/background.png';
import './Home.css'

export default function Home() {
  return (
    <>
      {/* GLOBAL BACKGROUND */}
      <div
        className="global-bg"
        style={{ backgroundImage: `url(${bg})` }}
      />

      <div className="app">
        <Navbar />
        <MainCompo />
        <Footer />
      </div>

         </>
  );
}
