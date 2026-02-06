import Navbar from '../components/hero/navbar';
import MainCompo from '../components/hero/mainCompo';
import Footer from '../components/hero/footer';
import bg from '../../assets/background.png';

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

      <style>{`
        html, body {
          margin: 0;
          padding: 0;
          height: 100%;
          background: #000;
          overflow: hidden;
        }

        /* Full-screen blurred background */
        .global-bg {
          position: fixed;
          inset: 0;
          background-size: cover;
          background-position: center;
          filter: blur(14px);
          z-index: 0;
        }

        .global-bg::after {
          content: '';
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.25);
        }

        .app {
          position: relative;
          z-index: 1;
          height: 100vh;
          display: flex;
          flex-direction: column;
          background: transparent;
        }
      `}</style>
    </>
  );
}
