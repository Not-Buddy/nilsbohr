import Navbar from '../components/hero/navbar';
import Footer from '../components/hero/footer';
import MainCompo from '../components/hero/mainCompo';
import bg from '../../assets/background.png';
import './Home.css';

export default function SelectRepoPage() {
  return (
    <>
      <div className="global-bg" style={{ backgroundImage: `url(${bg})` }} />
      <div className="app">
        <Navbar />
        <MainCompo />
        <Footer />
      </div>
    </>
  );
}
